from setuptools import setup, find_packages

setup(
    name="multimodal-ui",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        'multimodal_ui': ['static/**/*'],
    },
    install_requires=[
        'port-for>=0.4',
        'python-dotenv',
    ],
    entry_points={
        'console_scripts': [
            'multimodal-ui=multimodal_ui.cli:main',
        ],
    },
    description="Multimodal UI application packaged for Python",
    license="MIT",
    keywords="angular ui multimodal",
)
