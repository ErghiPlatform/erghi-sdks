"""Resource modules"""

from __future__ import annotations

from .auth import AuthResource
from .chat import ChatResource
from .insights import InsightsResource
from .workspace import WorkspaceResource

__all__ = ["AuthResource", "ChatResource", "InsightsResource", "WorkspaceResource"]
