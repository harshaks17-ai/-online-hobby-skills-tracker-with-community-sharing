"""
The *cloud service layer*.

This package is the seam between the application and any infrastructure vendor.
Every feature module depends on the three functions exported here, never on a
concrete SDK. That is what makes the project portable:

    STORAGE_PROVIDER=local   ->  filesystem bucket that mimics an object store
    STORAGE_PROVIDER=gcp    ->  Cloud Storage  (google-cloud-storage)
    STORAGE_PROVIDER=aws    ->  S3             (boto3)

The key naming convention is identical in all three cases
(`users/<uid>/<scope>/<file>.<ext>`), so switching providers changes URLs but
never data or code paths.
"""

from cloud.auth_service import describe_identity_provider, verify_identity_token
from cloud.database_service import (
    check_database,
    describe_database,
    execute,
    query,
    query_one,
    table_counts,
)
from cloud.storage_service import (
    build_object_key,
    delete_object,
    describe_storage,
    get_object,
    get_public_url,
    put_object,
    sign_url,
    storage_health,
    verify_signed_url,
)

__all__ = [
    "build_object_key",
    "check_database",
    "delete_object",
    "describe_database",
    "describe_identity_provider",
    "describe_storage",
    "execute",
    "get_object",
    "get_public_url",
    "put_object",
    "query",
    "query_one",
    "sign_url",
    "storage_health",
    "table_counts",
    "verify_identity_token",
    "verify_signed_url",
]
