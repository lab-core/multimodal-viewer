import http.server
import socketserver
import os
import webbrowser
from functools import partial
from pathlib import Path
from dotenv import load_dotenv

class AngularServer:
    def __init__(self, static_dir, port=8085, backend_port=8090):
        # Load environment variables
        self._load_env_vars()
        
        self.static_dir = os.path.abspath(static_dir)
        self.port = port
        self.backend_port = backend_port
        self.handler = partial(http.server.SimpleHTTPRequestHandler, directory=self.static_dir)
    
    def _load_env_vars(self):
        # Try to find the .env file in the project root (3 levels up from this file)
        env_path = Path(__file__).parent.parent.parent / '.env'
        if env_path.exists():
            load_dotenv(env_path)
        else:
            # Fallback to current directory if not found (for development)
            load_dotenv()
    
    def start(self):
        with socketserver.TCPServer(("", self.port), self.handler) as httpd:
            print(f"Serving Angular app at http://localhost:{self.port}")
            print(f"Backend is expected at http://localhost:{self.backend_port}")
            webbrowser.open(f'http://localhost:{self.port}')
            httpd.serve_forever()

def serve_angular_app(static_dir, port=None, backend_port=None):
    # If ports aren't specified, try to get from environment
    if port is None:
        port = int(os.getenv('PORT_CLIENT', '8085'))
    if backend_port is None:
        backend_port = int(os.getenv('PORT_SERVER', '8090'))
    
    server = AngularServer(static_dir, port, backend_port)
    server.start()