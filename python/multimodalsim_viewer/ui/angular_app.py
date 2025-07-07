import os
import signal
import threading
import time

from flask import Flask, send_from_directory


def configure_angular_app(app=None) -> Flask:
    static_dir = os.path.join(os.path.dirname(__file__), "static")

    if app is None:
        app = Flask(__name__, static_folder=static_dir)
    else:
        app.static_folder = static_dir

    @app.route("/<path:path>")
    def static_proxy(path):
        if os.path.exists(os.path.join(static_dir, path)):
            return send_from_directory(static_dir, path)

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

    return app
