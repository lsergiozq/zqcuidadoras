from backend.main import app as backend_app


async def app(scope, receive, send):
	if scope["type"] not in {"http", "websocket"}:
		await backend_app(scope, receive, send)
		return

	path = scope.get("path", "") or "/"
	if path == "/api":
		forwarded_path = "/"
	elif path.startswith("/api/"):
		forwarded_path = path[4:]
	else:
		forwarded_path = path

	if path.startswith("/api"):
		forwarded_scope = dict(scope)
		forwarded_scope["path"] = forwarded_path or "/"
		root_path = scope.get("root_path", "") or ""
		forwarded_scope["root_path"] = f"{root_path}/api" if root_path else "/api"
		await backend_app(forwarded_scope, receive, send)
		return

	await backend_app(scope, receive, send)
