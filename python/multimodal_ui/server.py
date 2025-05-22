import http.server
import os
import socketserver
import webbrowser
from pathlib import Path

from dotenv import load_dotenv


class AngularRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        self.static_dir = kwargs.pop("directory", None)
        super().__init__(*args, directory=self.static_dir, **kwargs)

    def translate_path(self, path):
        # Get the default translated path
        path = super().translate_path(path)

        # Get the relative path from the static directory
        relpath = os.path.relpath(path, self.static_dir)

        # If the path is outside our static directory, redirect to static dir
        if relpath.startswith(".."):
            path = os.path.join(self.static_dir, "index.html")

        # If the path doesn't exist, serve index.html
        if not os.path.exists(path):
            path = os.path.join(self.static_dir, "index.html")

        return path


class AngularServer:
    def __init__(self, static_dir, port=8085, backend_port=8089):
        self._load_env_vars()
        self.static_dir = os.path.abspath(static_dir)
        self.port = port
        self.backend_port = backend_port

    def _load_env_vars(self):
        env_path = Path(__file__).parent.parent.parent / ".env"
        if env_path.exists():
            load_dotenv(env_path)
        else:
            load_dotenv()

    def start(self):
        handler = lambda *args, **kwargs: AngularRequestHandler(
            *args, directory=self.static_dir, **kwargs
        )

        # Verify static directory exists
        if not os.path.exists(self.static_dir):
            raise FileNotFoundError(f"Static directory not found: {self.static_dir}")

        # Verify index.html exists
        index_path = os.path.join(self.static_dir, "index.html")
        if not os.path.exists(index_path):
            raise FileNotFoundError(
                f"index.html not found in static directory: {index_path}"
            )

        with socketserver.TCPServer(("", self.port), handler) as httpd:
            print(
                f"Serving Angular app from {self.static_dir} at http://localhost:{self.port}"
            )
            print(f"Backend is expected at http://localhost:{self.backend_port}")
            webbrowser.open(f"http://localhost:{self.port}")
            httpd.serve_forever()


def serve_angular_app(static_dir, port=None, backend_port=None):
    if port is None:
        port = int(os.getenv("PORT_CLIENT", "8085"))
    if backend_port is None:
        backend_port = int(os.getenv("PORT_SERVER", "8089"))

    server = AngularServer(static_dir, port, backend_port)
    server.start()
