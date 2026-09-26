"""Errores del contrato de servidor (SPEC §5: JSON {code,message} con
status 400/403/404/409/410/422)."""


class ContractError(Exception):
    """Error de negocio del contrato. `status` es el código HTTP de §5."""

    def __init__(self, code: str, message: str, status: int = 403):
        super().__init__(message)
        self.code = code
        self.status = status
        self.message = message


def bad_request(message: str, code: str = "bad_request") -> ContractError:
    return ContractError(code, message, 400)


def unauthorized(message: str, code: str = "unauthorized") -> ContractError:
    return ContractError(code, message, 401)


def forbidden(message: str, code: str = "forbidden") -> ContractError:
    return ContractError(code, message, 403)


def not_found(message: str, code: str = "not_found") -> ContractError:
    return ContractError(code, message, 404)


def conflict(message: str, code: str = "conflict") -> ContractError:
    return ContractError(code, message, 409)


def gone(message: str, code: str = "expired") -> ContractError:
    return ContractError(code, message, 410)


def unprocessable(message: str, code: str = "unprocessable") -> ContractError:
    return ContractError(code, message, 422)
