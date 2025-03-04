import os
import shutil
import zipfile
from flask import Blueprint, request, jsonify, send_file
import logging
import tempfile
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
data_dir = BASE_DIR / "data"

http_routes = Blueprint("http_routes", __name__)

@http_routes.route("/api/input_data/<folder_name>", methods=["GET"])
def export_input_data(folder_name):
    folder_path = os.path.join(data_dir, folder_name)
    logging.info(f"Requested folder: {folder_path}")
    if not os.path.isdir(folder_path):
        return jsonify({"error": "Folder not found"}), 404
    
    zip_path = os.path.join(tempfile.gettempdir(), f"{folder_name}.zip")
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, _, files in os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                zipf.write(file_path, os.path.relpath(file_path, folder_path))
    
    return send_file(zip_path, as_attachment=True)

@http_routes.route("/api/input_data/<folder_name>", methods=["POST"])
def import_input_data(folder_name):
    folder_path = os.path.join(data_dir, folder_name)
    os.makedirs(folder_path, exist_ok=True)

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    zip_path = os.path.join(tempfile.gettempdir(), file.filename)
    file.save(zip_path)

    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(folder_path)
            logging.info(f"Extracted files: {zip_ref.namelist()}")
        
        os.remove(zip_path)
    except zipfile.BadZipFile:
        return jsonify({"error": "Invalid ZIP file"}), 400

    return jsonify({"message": f"Folder '{folder_name}' uploaded successfully"}), 201


@http_routes.route("/api/input_data/<folder_name>", methods=["DELETE"])
def delete_input_data(folder_name):
    folder_path = os.path.join(data_dir, folder_name)
    if not os.path.isdir(folder_path):
        return jsonify({"error": "Folder not found"}), 404
    
    shutil.rmtree(folder_path)
    return jsonify({"message": f"Folder '{folder_name}' deleted successfully"})