import argparse
import os

from multimodalsim_viewer.common.utils import CLIENT_PORT, SERVER_PORT
from multimodalsim_viewer.ui.server import serve_angular_app


def main():
    parser = argparse.ArgumentParser(description="Multimodal UI Application")
    parser.add_argument(
        "--port",
        type=int,
        default=CLIENT_PORT,
        help="Port to serve the UI",
    )
    parser.add_argument(
        "--backend-port",
        type=int,
        default=SERVER_PORT,
        help="Port where backend server is running",
    )
    args = parser.parse_args()

    # Get the static files directory (relative to this package)
    static_dir = os.path.join(os.path.dirname(__file__), "static")

    serve_angular_app(static_dir, args.port, args.backend_port)


if __name__ == "__main__":
    main()
