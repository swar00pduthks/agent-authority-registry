"""What the agent uses to load its configuration from the registry service."""
from .client import RegistryClient, default_client
from .middleware import RegistryProfile

__all__ = ["RegistryClient", "RegistryProfile", "default_client"]
