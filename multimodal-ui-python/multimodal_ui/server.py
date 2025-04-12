import http.server
import socketserver
import os
import threading
import webbrowser
from functools import partial

class AngularServer:
    def __init__(self, static_dir, port=8085, backend_port=8089):
        self.static_dir = os.path.abspath(static_dir)
        self.port = port
        self.backend_port = backend_port
        self.handler = partial(http.server.SimpleHTTPRequestHandler, directory=self.static_dir)
    
    def start(self):
        with socketserver.TCPServer(("", self.port), self.handler) as httpd:
            print(f"Serving Angular app at http://localhost:{self.port}")
            print(f"Backend is expected at http://localhost:{self.backend_port}")
            webbrowser.open(f'http://localhost:{self.port}')
            httpd.serve_forever()

def serve_angular_app(static_dir, port=8085):
    server = AngularServer(static_dir, port)
    server.start()