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
    install_requires=[
        "flask==3.1.1",
        "flask-socketio==5.5.1",
        "eventlet==0.40.0",
        "websocket-client==1.8.0",
        "filelock==3.18.0",
        "flask_cors==6.0.0",
        "questionary==2.1.0",
        "python-dotenv==1.1.0",
        "multimodalsim==0.0.1",
    ],
    extras_require={"dev": ["black==25.1.0", "pylint==3.3.7", "isort==6.0.1"]},
    python_requires="==3.11.*",
    entry_points={
        "console_scripts": [
            "viewer=multimodalsim_viewer.server.scripts:main",
        ]
    },
)
