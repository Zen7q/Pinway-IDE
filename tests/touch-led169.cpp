#include <cassert>
#include <iostream>
#include "../examples/TouchLed169/touch_button.h"
int main() {
  TouchButton button;
  // Press/hold/release produces one activation, even with repeated contact reports.
  assert(!button.update(true, true, false, true, 10));
  assert(!button.update(true, true, false, true, 500));
  assert(button.update(false, true, true, true, 900));
  assert(!button.update(false, true, true, true, 910));
  assert(!button.update(false, true, false, false, 1200));
  // Starting outside or dragging out does not activate on release.
  assert(!button.update(true, false, false, true, 1300));
  assert(!button.update(true, true, false, true, 1400));
  assert(!button.update(false, true, false, true, 1500));
  assert(!button.update(true, true, false, true, 1600));
  assert(!button.update(true, false, false, true, 1700));
  assert(!button.update(false, true, true, true, 1800));
  // Controllers reporting a completed single-click IRQ without a down IRQ work too.
  assert(button.update(false, true, true, true, 1900));
  assert(!button.update(false, true, true, false, 2300));
  assert(button.update(false, true, true, true, 2400));
  // Unsigned elapsed time remains correct across millis() wraparound.
  TouchButton wrap;
  assert(wrap.update(false, true, true, true, UINT32_MAX - 100));
  assert(!wrap.update(false, true, true, true, 50));
  assert(wrap.update(false, true, true, true, 200));
  std::cout << "TouchLed169: tap, hold, drag-out, duplicate IRQ, tap-only IRQ, debounce and clock-wrap checks passed\n";
}
