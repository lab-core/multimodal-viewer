import argparse
import time
import webbrowser

from requests import get
from requests.exceptions import ConnectionError as RequestsConnectionError
from socketio import Client
from socketio.exceptions import ConnectionError as SocketIOConnectionError

from multimodalsim_viewer.common.utils import (
    CLIENT_PORT,
    HOST,
    SERVER_PORT,
)
from multimodalsim_viewer.server.server import configure_server
from multimodalsim_viewer.server.simulation import (
    configure_simulation_parser,
    start_simulation_cli,
)
from multimodalsim_viewer.ui.angular_app import configure_angular_app


def start(should_start_ui: bool, should_start_server: bool):
    app = None
    socketio = None

    if should_start_server:
        (app, socketio) = configure_server()

    if should_start_ui:
        app = configure_angular_app(app)

    # Use SERVER_PORT even for the client if the server is running
    ui_port = SERVER_PORT if should_start_server else CLIENT_PORT
    if should_start_ui:
        webbrowser.open(f"http://{HOST}:{ui_port}")

    if socketio is not None:
        socketio.run(app, host=HOST, port=SERVER_PORT)
    else:
        # app should not be None here
        app.run(host=HOST, port=CLIENT_PORT)


def stop(should_stop_ui: bool, should_stop_server: bool):
    if should_stop_ui:
        terminate_ui()
    if should_stop_server:
        terminate_server()


def terminate_server():
    print("Terminating server...")

    sio = Client()

    try:
        sio.connect(f"http://{HOST}:{SERVER_PORT}", auth={"type": "script"})

        sio.emit("terminate")

        time.sleep(1)

        sio.disconnect()

        print("Server terminated")

    except SocketIOConnectionError:  # pylint: disable=broad-exception-caught
        print("Server is not running or cannot be reached.")


def terminate_ui():
    print("Terminating UI...")

    terminated = False

    try:
        response = get(f"http://{HOST}:{CLIENT_PORT}/terminate", timeout=5)

        if response.status_code == 200:
            print("UI terminated")
            terminated = True
        else:
            print(f"Failed to terminate UI: {response.status_code}")

    except RequestsConnectionError:  # pylint: disable=broad-exception-caught
        print("UI is not running or cannot be reached.")

    if terminated:
        return

    print("Trying to terminate UI at server port...")
    try:
        response = get(f"http://{HOST}:{SERVER_PORT}/terminate", timeout=5)

        if response.status_code == 200:
            print("UI terminated at server port")
        else:
            print(f"Failed to terminate UI at server port: {response.status_code}")

    except RequestsConnectionError:
        print("UI is not running or cannot be reached at server port.")


def main():
    """
    Main entry point for the multimodal simulation viewer CLI.

    This function sets up the command-line interface using argparse and provides
    options to run the server, UI, or both, as well as to terminate them.
    """

    parser = argparse.ArgumentParser(description="Multimodal Simulation Viewer CLI")

    subparsers = parser.add_subparsers(dest="command", required=True)

    start_parser = subparsers.add_parser("start", help="Start the server and UI")
    start_parser.add_argument("--server", action="store_true", help="Start only the server")
    start_parser.add_argument("--ui", action="store_true", help="Start only the UI")

    stop_parser = subparsers.add_parser("stop", help="Stop the server and UI")
    stop_parser.add_argument("--ui", action="store_true", help="Stop only the UI")
    stop_parser.add_argument("--server", action="store_true", help="Stop only the server")

    simulate_parser = subparsers.add_parser("simulate", help="Run a simulation")
    configure_simulation_parser(simulate_parser)

    # Parse the arguments
    args = parser.parse_args()

    if args.command == "start":
        should_start_ui = args.ui or not args.server
        should_start_server = args.server or not args.ui
        start(should_start_ui, should_start_server)

    elif args.command == "stop":
        should_stop_ui = args.ui or not args.server
        should_stop_server = args.server or not args.ui
        stop(should_stop_ui, should_stop_server)

    elif args.command == "simulate":
        start_simulation_cli(args)


if __name__ == "__main__":
    main()
