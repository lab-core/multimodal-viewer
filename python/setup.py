from setuptools import find_packages, setup

setup(
    name="multimodalsim_viewer",
    version="0.1.0",
    description="Multimodal viewer",
    license="MIT",
    keywords="flask angular ui multimodal server",
    packages=find_packages(
        include=[
            "multimodal_server",
            "multimodal_server.*",
            "multimodal_ui",
            "multimodal_ui.*",
        ]
    ),
    include_package_data=True,
    package_data={
        "multimodal_ui": ["static/**/*"],
    },
    package_dir={"": "."},
    install_requires=[
        # Server requirements
        "flask==3.1.0",
        "flask-socketio==5.5.1",
        "eventlet==0.39.0",
        "websocket-client==1.8.0",
        "filelock==3.17.0",
        "flask_cors==5.0.1",
        "questionary==2.1.0",
        "python-dotenv==1.1.0",
        "multimodalsim==0.0.1",
        # UI requirements
        "port-for>=0.4",
    ],
    entry_points={
        "console_scripts": [
            "multimodalsim-server=multimodal_server.server:run_server",
            "multimodalsim-ui=multimodal_ui.cli:main",
            "multimodalsim-simulation=multimodal_server.simulation:run_simulation_cli",
            "multimodalsim-viewer=multimodal_server.scripts:run_server_and_ui",
        ]
    },
    python_requires=">=3.7",
)
