/** Errores del contrato de servidor (SPEC §5: JSON {code,message} con
 * status 400/403/404/409/410/422). */

export class ContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 403) {
    super(message);
    this.name = "ContractError";
    this.code = code;
    this.status = status;
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new ContractError(code, message, 400);
export const forbidden = (message: string, code = "forbidden") =>
  new ContractError(code, message, 403);
export const notFound = (message: string, code = "not_found") =>
  new ContractError(code, message, 404);
export const conflict = (message: string, code = "conflict") =>
  new ContractError(code, message, 409);
export const gone = (message: string, code = "expired") =>
  new ContractError(code, message, 410);
export const unprocessable = (message: string, code = "unprocessable") =>
  new ContractError(code, message, 422);
