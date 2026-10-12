"""Workspace resource"""

from __future__ import annotations

import builtins
from typing import TYPE_CHECKING

from ..errors import ErghiError, NotFoundError
from ..types import Workspace

if TYPE_CHECKING:
    from ..client import ErghiClient


class WorkspaceResource:
    """Workspaces of the signed-in user's account.

    The platform exposes list and create; renaming and deleting a workspace are
    done in the admin portal.
    """

    def __init__(self, client: ErghiClient) -> None:
        self.client = client

    async def get(self, workspace_id: str) -> Workspace:
        """Get one of the account's workspaces by ID"""
        for workspace in await self.list():
            if workspace.id == workspace_id:
                return workspace
        raise NotFoundError(f"Workspace {workspace_id} not found in this account")

    async def list(self) -> builtins.list[Workspace]:
        """List the workspaces of the signed-in user's account"""
        response = await self.client.request("GET", "/api/v1/accounts/workspaces")
        return [Workspace.from_summary(w) for w in response.json()]

    async def create(self, name: str, company_website: str | None = None) -> Workspace:
        """Create a new workspace in the signed-in user's account"""
        response = await self.client.request(
            "POST",
            "/api/v1/accounts/workspaces",
            json={"workspaceName": name, "companyWebsite": company_website},
        )
        data = response.json()
        self.client.set_workspace_id(data["workspaceId"])
        return Workspace.model_validate(
            {"workspaceId": data["workspaceId"], "name": data["workspaceName"]}
        )

    async def update(
        self,
        workspace_id: str,
        name: str | None = None,
        slug: str | None = None,
    ) -> Workspace:
        """Deprecated: the API has no workspace update endpoint. Always raises."""
        raise ErghiError(
            "Updating a workspace is not supported by the API", "NOT_SUPPORTED"
        )

    async def delete(self, workspace_id: str) -> None:
        """Deprecated: the API has no workspace delete endpoint. Always raises."""
        raise ErghiError(
            "Deleting a workspace is not supported by the API", "NOT_SUPPORTED"
        )

    def switch_workspace(self, workspace_id: str) -> None:
        """Switch current workspace context"""
        self.client.set_workspace_id(workspace_id)
