#pragma once
namespace PinwayHardware {
bool touchBegin();
bool touchIsReady();
bool touchButtonTapped();
bool touchPosition(int& x, int& y, bool& down);

}
