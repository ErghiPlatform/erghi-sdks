# ChatFlow Python SDK

Official Python SDK for the [ChatFlow Platform](https://chatflow.com).

## Installation

```bash
pip install aichat-sdk
```

## Quick Start

```python
import asyncio
from aichat import AIChatClient, RegisterRequest, LoginRequest

async def main():
    # Initialize the client
    async with AIChatClient(
        api_url="https://api.chatflow.com",
        api_key="your-api-key",
        workspace_id="your-workspace-id",
    ) as client:
        # Register a new user
        auth_response = await client.auth.register(
            RegisterRequest(
                email="user@example.com",
                password="SecurePassword123!",
                first_name="John",
                last_name="Doe",
            )
        )
        
        # Login
        login_response = await client.auth.login(
            LoginRequest(
                email="user@example.com",
                password="SecurePassword123!",
            )
        )
        
        # Get current user
        user = await client.auth.me()
        print(f"Current user: {user.email}")
        
        # Create a conversation
        conversation = await client.chat.create_conversation(
            widget_id="widget-id",
            metadata={"page": "https://example.com"},
        )
        
        # Send a message
        message = await client.chat.send_message(
            conversation_id=conversation.id,
            content="Hello, I need help!",
        )
        
        # Connect to WebSocket for real-time updates
        await client.connect()
        
        # Register event handlers
        client.on("message.received", lambda data: print(f"New message: {data}"))
        client.on("user.typing", lambda data: print(f"User typing: {data}"))
        
        # Keep connection alive
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
```

## Authentication

### Register

```python
from aichat import RegisterRequest

auth_response = await client.auth.register(
    RegisterRequest(
        email="user@example.com",
        password="SecurePassword123!",
        first_name="John",
        last_name="Doe",
    )
)
```

### Login

```python
from aichat import LoginRequest

auth_response = await client.auth.login(
    LoginRequest(
        email="user@example.com",
        password="SecurePassword123!",
    )
)
```

### Refresh Token

```python
auth_response = await client.auth.refresh("refresh-token")
```

### Logout

```python
await client.auth.logout()
```

## Chat Operations

### Create Conversation

```python
conversation = await client.chat.create_conversation(
    widget_id="widget-id",
    metadata={"custom_data": "value"},
)
```

### Send Message

```python
message = await client.chat.send_message(
    conversation_id="conversation-id",
    content="Hello!",
)
```

### Send Message with Attachments

```python
with open("document.pdf", "rb") as f:
    message = await client.chat.send_message(
        conversation_id="conversation-id",
        content="Here is the file",
        attachments=[f],
    )
```

### Get Messages

```python
from aichat.types import PaginationParams

response = await client.chat.get_messages(
    conversation_id="conversation-id",
    params=PaginationParams(
        page=1,
        limit=50,
        sort="createdAt",
        order="desc",
    ),
)

print(f"Total messages: {response.total}")
for message in response.data:
    print(f"{message.sender}: {message.content}")
```

## WebSocket Real-time Events

```python
# Connect to WebSocket
await client.connect()

# Listen for new messages
def on_message(message):
    print(f"New message: {message}")

client.on("message.received", on_message)

# Listen for typing indicators
client.on("user.typing", lambda data: print(f"User typing: {data}"))

# Listen for conversation assignment
client.on("conversation.assigned", lambda data: print(f"Assigned: {data}"))

# Send typing indicator
await client.chat.send_typing("conversation-id")

# Disconnect
await client.disconnect()
```

## Workspace Management

```python
# List workspaces
workspaces = await client.workspace.list()

# Create workspace
workspace = await client.workspace.create(
    name="My Company",
    slug="my-company",
)

# Switch workspace
client.workspace.switch_workspace("workspace-id")
```

## Error Handling

```python
from aichat import (
    AuthenticationError,
    ValidationError,
    RateLimitError,
    NetworkError,
    NotFoundError,
)

try:
    await client.auth.login(
        LoginRequest(email="invalid", password="wrong")
    )
except AuthenticationError as e:
    print(f"Login failed: {e.message}")
except ValidationError as e:
    print(f"Validation errors: {e.details}")
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after}s")
except NetworkError as e:
    print(f"Network error: {e.message}")
except NotFoundError:
    print("Resource not found")
```

## Type Safety

The SDK is fully typed with Pydantic models:

```python
from aichat.types import User, Message, Conversation, AuthResponse

user: User = await client.auth.me()
messages: PaginatedResponse = await client.chat.get_messages("conv-id")

# Type checking with mypy
reveal_type(user)  # Revealed type is "User"
```

## Configuration

```python
client = AIChatClient(
    # API base URL (default: http://localhost:5000)
    api_url="https://api.chatflow.com",
    
    # WebSocket URL (default: ws://localhost:5002)
    ws_url="wss://ws.chatflow.com",
    
    # API Key for authentication
    api_key="your-api-key",
    
    # Access token (JWT)
    access_token="your-access-token",
    
    # Workspace ID
    workspace_id="your-workspace-id",
    
    # Request timeout in seconds (default: 30.0)
    timeout=30.0,
    
    # Enable debug logging (default: False)
    debug=True,
)
```

## Context Manager

Use the client as an async context manager for automatic cleanup:

```python
async with AIChatClient(api_url="https://api.chatflow.com") as client:
    user = await client.auth.me()
    # Connections automatically closed on exit
```

## Advanced Usage

### Custom Event Handlers

```python
class MyEventHandler:
    async def handle_message(self, data):
        print(f"Message: {data}")
        # Process message asynchronously
        await self.process_message(data)
    
    async def process_message(self, data):
        # Custom processing logic
        pass

handler = MyEventHandler()
client.on("message.received", handler.handle_message)
```

### Concurrent Operations

```python
import asyncio

# Run multiple operations concurrently
results = await asyncio.gather(
    client.chat.get_conversation("conv-1"),
    client.chat.get_conversation("conv-2"),
    client.chat.get_messages("conv-1"),
)

conversation1, conversation2, messages = results
```

## Development

### Install development dependencies

```bash
pip install -e ".[dev]"
```

### Run tests

```bash
pytest
```

### Run tests with coverage

```bash
pytest --cov=aichat --cov-report=html
```

### Format code

```bash
black aichat tests
```

### Lint code

```bash
ruff check aichat tests
```

### Type checking

```bash
mypy aichat
```

## License

MIT
