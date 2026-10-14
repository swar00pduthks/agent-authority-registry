"""Status and environment rules, shared by the service and the CLI."""

STATUSES = ("draft", "approved", "deprecated", "revoked")
ENVIRONMENTS = ("dev", "uat", "prod")

# Which statuses an environment will serve. Deprecated still works but is flagged;
# revoked is never served.
SERVED = {
    "dev": {"draft", "approved", "deprecated"},
    "uat": {"approved", "deprecated"},
    "prod": {"approved", "deprecated"},
}
# A profile revision can only be pinned to an environment if its own status allows it.
PINNABLE = {
    "dev": {"draft", "approved"},
    "uat": {"approved"},
    "prod": {"approved"},
}
