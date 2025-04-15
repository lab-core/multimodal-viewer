import argparse
import os
from pathlib import Path
from dotenv import load_dotenv
from .server import serve_angular_app

def load_env_vars():
    # Try to find the .env file in the project root (3 levels up from this file)
    env_path = Path(__file__).parent.parent.parent / '.env'
    if env_path.exists():
        load_dotenv(env_path)
    else:
        # Fallback to current directory if not found (for development)
        load_dotenv()

def main():
    # Load environment variables first
    load_env_vars()
    
    parser = argparse.ArgumentParser(description='Multimodal UI Application')
    parser.add_argument('--port', type=int, default=int(os.getenv('PORT_CLIENT', '8085')), 
                       help='Port to serve the UI')
    parser.add_argument('--backend-port', type=int, 
                       default=int(os.getenv('PORT_SERVER', '8089')),
                       help='Port where backend server is running')
    args = parser.parse_args()
    
    # Get the static files directory (relative to this package)
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    
    serve_angular_app(static_dir, args.port, args.backend_port)

if __name__ == '__main__':
    main()