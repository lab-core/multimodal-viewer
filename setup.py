from setuptools import setup, find_packages

setup(
    name="multimodal-server",
    packages=find_packages(include=["multimodal_server", "multimodal_server.*"]),
    include_package_data=True,
    install_requires=[
        "flask==3.1.0",
        "flask-socketio==5.5.1",
        "eventlet==0.39.0",
        "websocket-client==1.8.0",
        "filelock==3.17.0",
        "flask_cors", 
        "questionary==2.1.0",
        "python-dotenv"
    ],
    entry_points={
        "console_scripts": [
            "multimodal-server=multimodal_server.server:run_server"
        ]
    },
    python_requires=">=3.7",
)
