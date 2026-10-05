"""Resource modules"""

from __future__ import annotations

from .auth import AuthResource
from .chat import ChatResource
from .workspace import WorkspaceResource

__all__ = ["AuthResource", "ChatResource", "WorkspaceResource"]
