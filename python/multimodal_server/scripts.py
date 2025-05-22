import threading

from multimodal_server.server import run_server
from multimodal_ui.cli import main as run_ui


def run_server_and_ui():
    # Start the server in a separate thread
    server_thread = threading.Thread(target=run_server)
    server_thread.start()

    # Start the UI in a separate thread
    ui_thread = threading.Thread(target=run_ui)
    ui_thread.start()

    # Wait for both threads to finish
    server_thread.join()
    ui_thread.join()
