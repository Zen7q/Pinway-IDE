#pragma once
#include <stdint.h>

// One activation per completed tap; a long hold does not repeatedly toggle.
// No GPIO/I2C here: the gesture logic can be tested on the host.
namespace PinwayHardware {
class TouchButton {
 public:
  bool held() const { return down_; }
  bool update(bool down, bool inside, bool tapGesture, bool newInterrupt, uint32_t now) {
    if (down) {
      if (!down_) armed_ = inside;
      if (!inside) armed_ = false;
      down_ = true;
      return false;
    }
    const bool completed = (down_ && armed_ && inside) ||
                           (!down_ && newInterrupt && tapGesture && inside);
    down_ = false;
    armed_ = false;
    if (!completed || (accepted_ && uint32_t(now - lastTap_) < 250)) return false;
    accepted_ = true;
    lastTap_ = now;
    return true;
  }
 private:
  bool down_ = false, armed_ = false, accepted_ = false;
  uint32_t lastTap_ = 0;
};

}
