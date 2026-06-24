"""AI Chat SDK Client"""

import asyncio
import json
import logging
from typing import Any, Callable, Dict, Optional
from urllib.parse import urljoin

import httpx
import websockets
from websockets.client import WebSocketClientProtocol

from .errors import (
    AIChatError,
    AuthenticationError,
    NetworkError,
    NotFoundError,
    RateLimitError,
    ValidationError,
)
from .resources.auth import AuthResource
from .resources.chat import ChatResource
from .resources.workspace import WorkspaceResource


logger = logging.getLogger(__name__)


class AIChatClient:
    """Main AI Chat SDK Client"""

    def __init__(
        self,
        api_url: str = "http://localhost:5000",
        ws_url: str = "ws://localhost:5002",
        api_key: Optional[str] = None,
        access_token: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        workspace_id: Optional[str] = None,
        timeout: float = 30.0,
        debug: bool = False,
    ) -> None:
        """
        Initialize AI Chat client

        Args:
            api_url: API base URL
            ws_url: WebSocket URL
            api_key: API key for authentication
            access_token: Access token (JWT)
            client_id: Client ID for M2M authentication
            client_secret: Client Secret for M2M authentication
            workspace_id: Workspace ID
            timeout: Request timeout in seconds
            debug: Enable debug logging
        """
        self.api_url = api_url
        self.ws_url = ws_url
        self.api_key = api_key
        self.access_token = access_token
        self.client_id = client_id
        self.client_secret = client_secret
        self.workspace_id = workspace_id
        self.timeout = timeout
        self.debug = debug

        if debug:
            logging.basicConfig(level=logging.DEBUG)

        # Initialize HTTP client
        self._http_client = httpx.AsyncClient(
            base_url=api_url,
            timeout=timeout,
            headers={"Content-Type": "application/json"},
        )

        # WebSocket connection
        self._ws: Optional[WebSocketClientProtocol] = None
        self._ws_task: Optional[asyncio.Task] = None
        self._event_handlers: Dict[str, list[Callable]] = {}
        self._reconnect_attempts = 0
        self._max_reconnect_attempts = 5

        # Initialize resources
        self.auth = AuthResource(self)
        self.chat = ChatResource(self)
        self.workspace = WorkspaceResource(self)

    async def __aenter__(self) -> "AIChatClient":
        """Async context manager entry"""
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Async context manager exit"""
        await self.close()

    async def close(self) -> None:
        """Close client connections"""
        await self.disconnect()
        await self._http_client.aclose()

    async def authenticate(self) -> str:
        """Authenticate using Client Credentials to obtain a JWT token"""
        if not self.client_id or not self.client_secret:
            raise AuthenticationError("client_id and client_secret are required for token exchange")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = urljoin(self.api_url + "/", "api/v1/auth/token")
                response = await client.post(
                    url,
                    json={
                        "grant_type": "client_credentials",
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                    },
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                data = response.json()
                token = data["access_token"]
                self.set_access_token(token)
                return token
        except httpx.HTTPStatusError as e:
            try:
                msg = e.response.json().get("message", str(e))
            except Exception:
                msg = str(e)
            raise AuthenticationError(f"Failed to authenticate: {msg}")
        except Exception as e:
            raise AuthenticationError(f"Failed to authenticate: {str(e)}")

    def _get_headers(self) -> Dict[str, str]:
        """Get request headers"""
        headers: Dict[str, str] = {}
        
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        
        if self.workspace_id:
            headers["X-Workspace-ID"] = self.workspace_id
        
        return headers

    async def request(
        self,
        method: str,
        path: str,
        **kwargs: Any,
    ) -> httpx.Response:
        """Make HTTP request"""
        if self.client_id and self.client_secret and not self.access_token:
            try:
                await self.authenticate()
            except Exception as e:
                logger.error(f"Auto-authentication failed: {e}")

        try:
            headers = self._get_headers()
            headers.update(kwargs.pop("headers", {}))

            response = await self._http_client.request(
                method,
                path,
                headers=headers,
                **kwargs,
            )

            response.raise_for_status()
            return response

        except httpx.HTTPStatusError as e:
            raise self._handle_error(e)
        except httpx.RequestError as e:
            raise NetworkError(f"Network request failed: {str(e)}", details=str(e))

    def _handle_error(self, error: httpx.HTTPStatusError) -> AIChatError:
        """Handle HTTP errors"""
        response = error.response
        
        try:
            data = response.json()
            message = data.get("message", str(error))
            details = data.get("errors")
        except Exception:
            message = str(error)
            details = None

        status_code = response.status_code

        if status_code == 400:
            return ValidationError(message, details)
        elif status_code == 401:
            return AuthenticationError(message)
        elif status_code == 404:
            return NotFoundError(message)
        elif status_code == 429:
            retry_after = int(response.headers.get("Retry-After", "60"))
            return RateLimitError(message, retry_after)
        else:
            return AIChatError(message, "API_ERROR", status_code, details)

    def set_access_token(self, token: str) -> None:
        """Set access token"""
        self.access_token = token

    def set_workspace_id(self, workspace_id: str) -> None:
        """Set workspace ID"""
        self.workspace_id = workspace_id

    async def connect(self) -> None:
        """Connect to WebSocket"""
        if self._ws and not self._ws.closed:
            return

        ws_url = f"{self.ws_url}/hubs/chat?access_token={self.access_token}"
        
        try:
            self._ws = await websockets.connect(ws_url)
            self._reconnect_attempts = 0
            logger.debug("WebSocket connected")
            
            # Start listening for messages
            self._ws_task = asyncio.create_task(self._listen())
            
            # Emit connected event
            await self._emit("connected", {})

        except Exception as e:
            logger.error(f"WebSocket connection failed: {e}")
            await self._reconnect()

    async def disconnect(self) -> None:
        """Disconnect from WebSocket"""
        if self._ws_task:
            self._ws_task.cancel()
            try:
                await self._ws_task
            except asyncio.CancelledError:
                pass

        if self._ws:
            await self._ws.close()
            self._ws = None

    async def send(self, event_type: str, data: Any) -> None:
        """Send message over WebSocket"""
        if not self._ws or self._ws.closed:
            raise AIChatError("WebSocket is not connected", "WS_NOT_CONNECTED")

        message = json.dumps({"type": event_type, "data": data})
        await self._ws.send(message)

    def on(self, event: str, handler: Callable) -> None:
        """Register event handler"""
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)

    def off(self, event: str, handler: Optional[Callable] = None) -> None:
        """Unregister event handler"""
        if event not in self._event_handlers:
            return

        if handler is None:
            del self._event_handlers[event]
        else:
            self._event_handlers[event].remove(handler)

    async def _emit(self, event: str, data: Any) -> None:
        """Emit event to handlers"""
        if event in self._event_handlers:
            for handler in self._event_handlers[event]:
                try:
                    result = handler(data)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    logger.error(f"Error in event handler: {e}")

    async def _listen(self) -> None:
        """Listen for WebSocket messages"""
        try:
            async for message in self._ws:  # type: ignore
                try:
                    data = json.loads(message)
                    event_type = data.get("type")
                    event_data = data.get("data")
                    
                    logger.debug(f"WebSocket message: {event_type}")
                    await self._emit(event_type, event_data)
                    
                except json.JSONDecodeError:
                    logger.error(f"Failed to parse WebSocket message: {message}")

        except websockets.exceptions.ConnectionClosed:
            logger.debug("WebSocket connection closed")
            await self._emit("disconnected", {})
            await self._reconnect()

    async def _reconnect(self) -> None:
        """Reconnect to WebSocket"""
        if self._reconnect_attempts >= self._max_reconnect_attempts:
            logger.error("Max reconnect attempts reached")
            return

        self._reconnect_attempts += 1
        delay = min(2 ** self._reconnect_attempts, 30)
        
        logger.debug(f"Reconnecting in {delay}s (attempt {self._reconnect_attempts})")
        await asyncio.sleep(delay)
        
        await self.connect()
