import os

from setuptools import find_packages, setup

# Get the version from the environment variable
VERSION = os.getenv("PYTHON_PACKAGE_VERSION")

if not VERSION:
    print(
        "WARNING: "
        "Python package version is not set. Using default version 0.0.1. "
        "You can set it using the environment variable PYTHON_PACKAGE_VERSION. "
        "(see README.md for more information)"
    )
    VERSION = "0.0.1"

# Read README.md for the long description
LONG_DESCRIPTION = "multimodalsim-viewer"
if os.path.exists("README.md"):
    with open("README.md", "r", encoding="utf-8") as f:
        LONG_DESCRIPTION = f.read()

setup(
    name="multimodalsim_viewer",
    version=VERSION,
    description="Multimodal simulation viewer",
    long_description=LONG_DESCRIPTION,
    long_description_content_type="text/markdown",
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
        "get_latest_version==1.0.3",
        "setuptools==80.9.0",
    ],
    extras_require={"dev": ["black==25.1.0", "pylint==3.3.7", "isort==6.0.1"], "build": ["build", "twine"]},
    python_requires=">=3.10",
    entry_points={
        "console_scripts": [
            "viewer=multimodalsim_viewer.server.scripts:main",
        ]
    },
)
