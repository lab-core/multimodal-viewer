from setuptools import setup, find_packages

setup(
    name="multimodal-package",
    version="0.1.0",
    description="Multimodal server and UI package",
    license="MIT",
    keywords="flask angular ui multimodal server",
    packages=find_packages(include=["multimodal_server", "multimodal_server.*", "multimodal_ui", "multimodal_ui.*"]),
    include_package_data=True,
    package_data={
        'multimodal_ui': ['static/**/*'],
    },
    install_requires=[
        # Server requirements
        "flask==3.1.0",
        "flask-socketio==5.5.1",
        "eventlet==0.39.0",
        "websocket-client==1.8.0",
        "filelock==3.17.0",
        "flask_cors", 
        "questionary==2.1.0",
        "python-dotenv",
        
        # UI requirements
        'port-for>=0.4',
    ],
    entry_points={
        "console_scripts": [
            "multimodal-server=multimodal_server.server:run_server",
            "multimodal-ui=multimodal_ui.cli:main",
        ]
    },
    python_requires=">=3.7",
)
