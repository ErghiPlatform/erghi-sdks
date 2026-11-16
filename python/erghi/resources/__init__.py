"""Resource modules"""

from __future__ import annotations

from .auth import AuthResource
from .chat import ChatResource
from .contacts import ContactsResource
from .inbox import InboxResource
from .insights import InsightsResource
from .workspace import WorkspaceResource

__all__ = [
    "AuthResource",
    "ChatResource",
    "ContactsResource",
    "InboxResource",
    "InsightsResource",
    "WorkspaceResource",
]
