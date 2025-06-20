import os
import signal
import threading
import time
import webbrowser

from flask import Flask, send_from_directory

from multimodalsim_viewer.common.utils import CLIENT_PORT, HOST, SERVER_PORT


def serve_angular_app(static_dir, port=None, backend_port=None):
    if port is None:
        port = CLIENT_PORT
    if backend_port is None:
        backend_port = SERVER_PORT

    app = Flask(__name__, static_folder=static_dir)

    @app.route("/<path:path>")
    def static_proxy(path):
        if os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)
        else:
            return send_from_directory(static_dir, "index.html")

    @app.route("/")
    def root():
        return send_from_directory(static_dir, "index.html")

    @app.route("/terminate")
    def terminate():
        pid = os.getpid()

        def delayed_kill():
            time.sleep(1)
            os.kill(pid, signal.SIGINT)

        threading.Thread(target=delayed_kill, daemon=True).start()

        return "UI terminated", 200

    print(f"Serving Angular app from {static_dir} at http://localhost:{port}")
    print(f"Backend is expected at http://localhost:{backend_port}")

    webbrowser.open(f"http://localhost:{port}")

    app.run(host=HOST, port=port)
