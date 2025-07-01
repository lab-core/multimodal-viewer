# multimodalsim-viewer

This package provides an interface to the [multimodalsim simulation project](https://pypi.org/project/multimodalsim/), allowing you to run and visualize simulations easily through a web interface.

## Usage

You have access to several commands that will allow you to run the project easily.

```bash
viewer start 
viewer start --ui     # only start the UI side
viewer start --server # only start the server 

viewer stop
viewer stop --ui     # only stop the UI side
viewer stop --server # only stop the server
```

You can also run a simulation from the command line. Several arguments are available to customize the simulation and can be found with the --help option, but the required arguments will be asked interactively if not provided. The command to run a simulation is:

```bash
viewer simulate
```