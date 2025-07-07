import logging
import os
import shutil
import tempfile
import zipfile

from flask import Blueprint, jsonify, request, send_file

from multimodalsim_viewer.common.utils import get_input_data_directory_path
from multimodalsim_viewer.server.simulation_visualization_data_model import (
    SimulationVisualizationDataManager,
)

http_routes = Blueprint("http_routes", __name__)

# MARK: Zip Management


def get_unique_folder_name(base_path, folder_name):
    counter = 1
    original_name = folder_name
    while os.path.exists(os.path.join(base_path, folder_name)):
        folder_name = f"{original_name}_({counter})"
        counter += 1
    return folder_name


def zip_folder(folder_path, zip_name):
    if not os.path.isdir(folder_path):
        return None

    zip_path = os.path.join(tempfile.gettempdir(), f"{zip_name}.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for root, _, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                zip_file.write(file_path, os.path.relpath(file_path, folder_path))

    return zip_path


def handle_zip_upload(folder_path):
    parent_dir = os.path.dirname(folder_path)
    base_folder_name = os.path.basename(folder_path)

    unique_folder_name = get_unique_folder_name(parent_dir, base_folder_name)
    actual_folder_path = os.path.join(parent_dir, unique_folder_name)

    os.makedirs(actual_folder_path, exist_ok=True)

    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    zip_path = os.path.join(tempfile.gettempdir(), file.filename)
    file.save(zip_path)

    try:
        with zipfile.ZipFile(zip_path, "r") as zip_ref:
            zip_ref.extractall(actual_folder_path)
            logging.info("Extracted files: %s", zip_ref.namelist())

        os.remove(zip_path)
    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid ZIP file"}), 400

    response_message = f"Folder '{unique_folder_name}' uploaded successfully"
    if unique_folder_name != base_folder_name:
        response_message += f" (renamed from '{base_folder_name}')"

    return (
        jsonify({"message": response_message, "actual_folder_name": unique_folder_name}),
        201,
    )


# MARK: Input Data Routes
@http_routes.route("/api/input_data/<folder_name>", methods=["GET"])
def export_input_data(folder_name):
    folder_path = get_input_data_directory_path(folder_name)
    logging.info("Requested folder: %s", folder_path)

    zip_path = zip_folder(folder_path, folder_name)
    if not zip_path:
        return jsonify({"error": "Folder not found"}), 404

    return send_file(zip_path, as_attachment=True)


@http_routes.route("/api/input_data/<folder_name>", methods=["POST"])
def import_input_data(folder_name):
    folder_path = get_input_data_directory_path(folder_name)
    return handle_zip_upload(folder_path)


@http_routes.route("/api/input_data/<folder_name>", methods=["DELETE"])
def delete_input_data(folder_name):
    folder_path = get_input_data_directory_path(folder_name)
    if not os.path.isdir(folder_path):
        return jsonify({"error": "Folder not found"}), 404

    shutil.rmtree(folder_path)
    return jsonify({"message": f"Folder '{folder_name}' deleted successfully"})


# MARK: Saved Simulations Routes
@http_routes.route("/api/simulation/<folder_name>", methods=["GET"])
def export_saved_simulation(folder_name):
    folder_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(folder_name)
    logging.info("Requested folder: %s", folder_path)

    zip_path = zip_folder(folder_path, folder_name)
    if not zip_path:
        return jsonify({"error": "Folder not found"}), 404

    return send_file(zip_path, as_attachment=True)


@http_routes.route("/api/simulation/<folder_name>", methods=["POST"])
def import_saved_simulation(folder_name):
    folder_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(folder_name)
    return handle_zip_upload(folder_path)


@http_routes.route("/api/simulation/<folder_name>", methods=["DELETE"])
def delete_saved_simulation(folder_name):
    folder_path = SimulationVisualizationDataManager.get_saved_simulation_directory_path(folder_name)
    if not os.path.isdir(folder_path):
        return jsonify({"error": "Folder not found"}), 404

    shutil.rmtree(folder_path)
    return jsonify({"message": f"Folder '{folder_name}' deleted successfully"})
