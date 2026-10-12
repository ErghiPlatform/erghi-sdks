"""Wire-contract tests for the auth and workspace resources.

The gateway forwards ``/api/auth/*`` to GoTrue verbatim, so these pin the real
GoTrue paths and snake_case bodies, and the account workspace endpoints.
"""

import json
from typing import Any, Callable

import httpx
import pytest

from erghi.client import ErghiClient
from erghi.errors import AuthenticationError, ErghiError, NotFoundError
from erghi.types import LoginRequest, RegisterRequest

SESSION: dict[str, Any] = {
    "access_token": "at-1",
    "refresh_token": "rt-1",
    "expires_in": 3600,
    "token_type": "bearer",
    "user": {
        "id": "u-1",
        "email": "qa@example.com",
        "role": "authenticated",
        "email_confirmed_at": "2026-10-01T00:00:00Z",
        "created_at": "2026-10-01T00:00:00Z",
        "last_sign_in_at": None,
        "user_metadata": {"first_name": "Q"},
    },
}


def make_client(
    respond: Callable[[httpx.Request], Any],
) -> "tuple[ErghiClient, list[httpx.Request]]":
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=respond(request))

    client = ErghiClient(api_url="http://erghi.test")
    client._http_client = httpx.AsyncClient(
        base_url="http://erghi.test", transport=httpx.MockTransport(handler)
    )
    return client, seen


def body(request: httpx.Request) -> Any:
    return json.loads(request.content)


@pytest.mark.asyncio
async def test_login_maps_gotrue_session() -> None:
    client, seen = make_client(lambda _: SESSION)
    auth = await client.auth.login(
        LoginRequest(email="qa@example.com", password="pw", two_factor_code="1")
    )
    assert seen[0].url.path == "/api/auth/login"
    assert body(seen[0]) == {"email": "qa@example.com", "password": "pw"}
    assert auth.access_token == "at-1"
    assert auth.user.first_name == "Q"
    assert auth.user.email_verified is True
    assert client.access_token == "at-1"


@pytest.mark.asyncio
async def test_refresh_uses_token_grant() -> None:
    client, seen = make_client(lambda _: SESSION)
    await client.auth.refresh("rt-0")
    assert seen[0].url.path == "/api/auth/token"
    assert seen[0].url.params["grant_type"] == "refresh_token"
    assert body(seen[0]) == {"refresh_token": "rt-0"}


@pytest.mark.asyncio
async def test_register_without_session_keeps_token() -> None:
    pending = dict(SESSION["user"], email_confirmed_at=None)
    client, seen = make_client(lambda _: pending)
    auth = await client.auth.register(
        RegisterRequest(email="qa@example.com", password="pw", first_name="Q")
    )
    assert body(seen[0])["data"]["first_name"] == "Q"
    assert auth.access_token == ""
    assert auth.user.email_verified is False
    assert client.access_token is None


@pytest.mark.asyncio
async def test_me_and_recover_paths() -> None:
    client, seen = make_client(lambda r: SESSION["user"] if r.method == "GET" else {})
    user = await client.auth.me()
    await client.auth.forgot_password("qa@example.com")
    assert seen[0].url.path == "/api/auth/user"
    assert user.id == "u-1"
    assert seen[1].url.path == "/api/auth/recover"


@pytest.mark.asyncio
async def test_reset_password_uses_recovery_session() -> None:
    client, seen = make_client(
        lambda r: {"access_token": "recovery-at"} if r.method == "POST" else {}
    )
    await client.auth.reset_password("hash-1", "new-pw")
    assert body(seen[0]) == {"type": "recovery", "token_hash": "hash-1"}
    assert seen[1].method == "PUT"
    assert seen[1].url.path == "/api/auth/user"
    assert seen[1].headers["Authorization"] == "Bearer recovery-at"
    assert body(seen[1]) == {"password": "new-pw"}


@pytest.mark.asyncio
async def test_reset_password_rejects_unaccepted_token() -> None:
    client, seen = make_client(lambda _: {})
    with pytest.raises(AuthenticationError):
        await client.auth.reset_password("bad", "pw")
    assert len(seen) == 1


ROWS = [
    {"workspaceId": "w-1", "name": "One", "slug": "one", "isCurrent": True},
    {"workspaceId": "w-2", "name": "Two", "slug": None, "isCurrent": False},
]


@pytest.mark.asyncio
async def test_workspace_list_and_get() -> None:
    client, seen = make_client(lambda _: ROWS)
    workspaces = await client.workspace.list()
    assert seen[0].url.path == "/api/v1/accounts/workspaces"
    assert [(w.id, w.slug, w.is_current) for w in workspaces] == [
        ("w-1", "one", True),
        ("w-2", "", False),
    ]
    assert (await client.workspace.get("w-2")).name == "Two"
    with pytest.raises(NotFoundError):
        await client.workspace.get("w-9")


@pytest.mark.asyncio
async def test_workspace_create_and_unsupported() -> None:
    client, seen = make_client(lambda _: {"workspaceId": "w-3", "workspaceName": "Three"})
    workspace = await client.workspace.create("Three", "https://example.test")
    assert body(seen[0]) == {
        "workspaceName": "Three",
        "companyWebsite": "https://example.test",
    }
    assert workspace.id == "w-3"
    with pytest.raises(ErghiError):
        await client.workspace.update("w-3", name="x")
    with pytest.raises(ErghiError):
        await client.workspace.delete("w-3")
    assert len(seen) == 1


@pytest.mark.asyncio
async def test_gotrue_error_text_is_surfaced() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"code": 400, "msg": "Invalid login credentials"})

    client = ErghiClient(api_url="http://erghi.test")
    client._http_client = httpx.AsyncClient(
        base_url="http://erghi.test", transport=httpx.MockTransport(handler)
    )
    with pytest.raises(ErghiError, match="Invalid login credentials"):
        await client.auth.login(LoginRequest(email="qa@example.com", password="x"))
