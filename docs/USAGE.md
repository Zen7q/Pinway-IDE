# User guide

## First launch

Install Pinway from [GitHub Releases](https://github.com/Zen7q/Pinway-IDE/releases/latest). Choose a theme, board support and optional workspaces in the setup wizard. Code and Arduino AVR are included. ESP32, Build and Display can be installed later in Settings.

The application interface is currently in Ukrainian. On macOS, open Settings from the application menu or with Command-comma. Settings includes appearance, editor preferences, installed packages and optional update checks.

## Projects and editing

Create a project and choose its folder, or open an existing `.ino` file. The file tree and editor work without a connected board. Save with Command-S on macOS or Control-S on Windows. Recent projects, open tabs and recovery drafts help resume work after restarting.

Automatic saving is optional. Project files, board options and generated Display data stay with their project. Pinway preserves existing files when preparing the temporary Arduino-compatible compilation copy.

## Boards, compilation and upload

Select the board in the title bar. Use Tools to choose the port and the parameters supported by that board. Install ESP32 support through Settings or the action at the bottom of the board selector. Search also exposes that action when no matching board is available.

| Board | Profile and settings |
|---|---|
| Arduino Uno R3 | Arduino Uno R3. |
| Arduino Nano clone | Arduino Nano, then Tools → Processor → ATmega328P (Old Bootloader) when required by the board. |
| ESP32 | ESP32 Dev Module or the exact profile for your module. |
| ESP32-C3 | ESP32C3 Dev Module or the exact profile. Native USB boards may require USB CDC On Boot. |

Click **Verify** (`Перевірити`) to compile without uploading. Click **Upload** (`Завантажити`) to compile and write firmware to the selected device. The console shows the full operation log. The Problems panel links compiler diagnostics to source lines.

USB detection may identify only a chip family or serial adapter. Check the exact board profile before uploading. Re-select the port if a device reconnects under a new port name.

## Libraries and serial tools

The Libraries sidebar searches Arduino libraries and installs them for use in sketches. New library downloads need an internet connection.

Serial Monitor displays output from the selected port. Choose the baud rate, open the connection and optionally send commands with the selected line ending. Pinway releases the port before uploading. Reopen the monitor after uploading.

Plotter reads numeric samples from Serial Monitor, including comma-separated values or labelled values such as `temp:24.5 humidity:60`.

## Build

Choose Pinway Build from the workspace menu. If its package is missing, Pinway offers to install it. The circuit belongs to the same project as the sketch.

Place components, connect their contacts and use Breadboard, Schematic or PCB views. Views share connectivity while preserving their own positions and routes. PCB footprints are illustrative and fabrication export is still pending. Circuit data is saved in `.pinway/circuit.json`.

## Display

Choose Pinway Display and install its package if prompted. Select and configure a physical display before adding interface elements. Display supports pages, layers, previews and bindings to supported global variables in the sketch.

Layouts are saved in `.pinway/display.json`. Supported profiles can generate drivers and firmware assets when compiling. Manually edited generated files are checked before replacement.

See the [display catalog](display-catalog.md) for supported profiles and the [Waveshare guide](waveshare.md) for the 1.69-inch touch display workflow.
