"""RBAC 共享辅助函数"""
from app.models.rbac import Role, Permission
from app.schemas.rbac import PermissionResponse, RoleResponse


def permission_to_response(permission: Permission) -> PermissionResponse:
    """将 Permission 对象安全地转换为 PermissionResponse"""
    perm_dict = {
        "id": permission.id,
        "name": permission.name,
        "code": permission.code,
        "resource": permission.resource,
        "action": permission.action,
        "type": permission.type,
        "type_name": getattr(permission, "type_name", None),
        "group_name": getattr(permission, "group_name", None),
        "is_system_admin_only": getattr(permission, "is_system_admin_only", False),
        "description": permission.description,
        "parent_id": permission.parent_id,
        "sort_order": permission.sort_order,
        "is_active": permission.is_active,
        "created_at": permission.created_at,
        "updated_at": permission.updated_at,
        "children": [],
    }
    return PermissionResponse.model_validate(perm_dict)


def role_to_response(role: Role) -> RoleResponse:
    """将 Role 对象安全地转换为 RoleResponse"""
    permissions_list = []
    if role.permissions:
        for perm in role.permissions:
            permissions_list.append(permission_to_response(perm).model_dump())
    role_dict = {
        "id": role.id,
        "name": role.name,
        "code": role.code,
        "team_code": role.team_code,
        "description": role.description,
        "is_active": role.is_active,
        "permissions": permissions_list,
        "created_at": role.created_at,
        "updated_at": role.updated_at,
    }
    return RoleResponse.model_validate(role_dict)
