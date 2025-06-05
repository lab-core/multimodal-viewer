from setuptools import find_packages, setup

setup(
    name="multimodalsim_viewer",
    version="0.0.2",
    description="Multimodal simulation viewer",
    license="MIT",
    keywords="flask angular ui multimodal server",
    packages=find_packages(
        include=[
            "multimodalsim_viewer",
            "multimodalsim_viewer.*",
        ]
    ),
    include_package_data=True,
    package_data={
        "multimodalsim_viewer": ["ui/static/**/*"],
        "environments": ["common/environments/**/*"],
    },
    install_requires=[
        # Common requirements
        # Server requirements
        "flask==3.1.1",
        "flask-socketio==5.5.1",
        "eventlet==0.40.0",
        "websocket-client==1.8.0",
        "filelock==3.18.0",
        "flask_cors==6.0.0",
        "questionary==2.1.0",
        "python-dotenv==1.1.0",
        "multimodalsim==0.0.1",
        # UI requirements
    ],
    python_requires="==3.11.*",
    entry_points={
        "console_scripts": [
            "multimodalsim-server=multimodalsim_viewer.server.server:run_server",
            "multimodalsim-ui=multimodalsim_viewer.ui.cli:main",
            "multimodalsim-simulation=multimodalsim_viewer.server.simulation:run_simulation_cli",
            "multimodalsim-viewer=multimodalsim_viewer.server.scripts:run_server_and_ui",
            "multimodalsim-stop-server=multimodalsim_viewer.server.scripts:terminate_server",
            "multimodalsim-stop-ui=multimodalsim_viewer.server.scripts:terminate_ui",
            "multimodalsim-stop-all=multimodalsim_viewer.server.scripts:terminate_all",
        ]
    },
)
