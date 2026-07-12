"""Workspace resource"""

from typing import TYPE_CHECKING, List, Optional

from ..types import Workspace

if TYPE_CHECKING:
    from ..client import ErghiClient


class WorkspaceResource:
    """Workspace resource"""

    def __init__(self, client: "ErghiClient") -> None:
        self.client = client

    async def get(self, workspace_id: str) -> Workspace:
        """Get workspace by ID"""
        response = await self.client.request(
            "GET",
            f"/api/workspaces/{workspace_id}",
        )
        return Workspace.model_validate(response.json())

    async def list(self) -> List[Workspace]:
        """List user's workspaces"""
        response = await self.client.request("GET", "/api/workspaces")
        data = response.json()
        return [Workspace.model_validate(w) for w in data]

    async def create(self, name: str, slug: Optional[str] = None) -> Workspace:
        """Create a new workspace"""
        response = await self.client.request(
            "POST",
            "/api/workspaces",
            json={"name": name, "slug": slug},
        )

        workspace = Workspace.model_validate(response.json())
        self.client.set_workspace_id(workspace.id)

        return workspace

    async def update(
        self,
        workspace_id: str,
        name: Optional[str] = None,
        slug: Optional[str] = None,
    ) -> Workspace:
        """Update workspace"""
        data = {}
        if name is not None:
            data["name"] = name
        if slug is not None:
            data["slug"] = slug

        response = await self.client.request(
            "PUT",
            f"/api/workspaces/{workspace_id}",
            json=data,
        )
        return Workspace.model_validate(response.json())

    async def delete(self, workspace_id: str) -> None:
        """Delete workspace"""
        await self.client.request("DELETE", f"/api/workspaces/{workspace_id}")

    def switch_workspace(self, workspace_id: str) -> None:
        """Switch current workspace context"""
        self.client.set_workspace_id(workspace_id)
