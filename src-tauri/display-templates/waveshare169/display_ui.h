#pragma once
namespace PinwayHardware {
void displayBegin();
void displayState(bool ledOn, bool touchReady);
// Used by generated Code-variable bindings; pixels are already RGB565.
void displayPixels(const unsigned short* pixels);

void displayPixelRows(const unsigned short* pixels, int y, int rows);

}
