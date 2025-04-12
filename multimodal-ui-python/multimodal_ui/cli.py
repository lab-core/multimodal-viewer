import argparse
from .server import serve_angular_app

def main():
    parser = argparse.ArgumentParser(description='Multimodal UI Application')
    parser.add_argument('--port', type=int, default=8085, help='Port to serve the UI')
    parser.add_argument('--backend-port', type=int, default=8089, 
                       help='Port where backend server is running')
    args = parser.parse_args()
    
    # Get the static files directory (relative to this package)
    import os
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    
    serve_angular_app(static_dir, args.port)

if __name__ == '__main__':
    main()