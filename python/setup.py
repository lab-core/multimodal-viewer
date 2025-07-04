import os

from setuptools import find_packages, setup

# Get the version from the environment variable
version = os.getenv("PYTHON_PACKAGE_VERSION")

if not version:
    try:
        # Imports are done here because the libraries may not be installed
        # in the environment where this script is run.
        # During builds (python -m build), the library get_latest_version
        # is not installed, so we need to handle the import error gracefully.
        from get_latest_version.pypi import get_current_module_version
        from requests.exceptions import HTTPError

        print("PYTHON_PACKAGE_VERSION is not set. Trying to get the latest version from PyPI...")

        # A second try-except block is used because we need the error class
        # from the requests library, which may not be installed.
        try:
            # Get the latest version from PyPI
            # This is only used if the version is not set in the environment variable
            # and will probably never happen during builds.
            version = get_current_module_version("multimodalsim_viewer")
        except HTTPError:
            print("Failed to get the latest version from PyPI.")
    except ImportError:
        print("get_latest_version library is not installed.Couldn't get the latest version from PyPI.")
if not version:
    raise ValueError(
        "Python package version is not set. "
        "You can set it using the environment variable PYTHON_PACKAGE_VERSION. "
        "(see README.md for more information)"
    )

# Read README.md for the long description
# Pylint considers this variable as a constant for an unknown reason
long_description = "multimodalsim-viewer"  # pylint: disable=invalid-name
if os.path.exists("README.md"):
    with open("README.md", "r", encoding="utf-8") as f:
        long_description = f.read()

setup(
    name="multimodalsim_viewer",
    version=version,
    description="Multimodal simulation viewer",
    long_description=long_description,
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
    ],
    extras_require={"dev": ["black==25.1.0", "pylint==3.3.7", "isort==6.0.1"], "build": ["build", "twine"]},
    python_requires="==3.11.*",
    entry_points={
        "console_scripts": [
            "viewer=multimodalsim_viewer.server.scripts:main",
        ]
    },
)
