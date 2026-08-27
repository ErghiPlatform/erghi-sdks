// jest-preset-angular's setup-env is a NAMED EXPORT that must be called -- the bare side-effect
// import below (still valid for the pinned v14.6.2 here) is deprecated as of the library's own
// newer versions and prints a warning; called via the modern function form so this keeps working
// cleanly on any future jest-preset-angular upgrade without silently double-initializing (see
// erghi-admin-portal's CLAUDE.md entry for what a real double-init failure looks like -- not a
// risk here since this package has no Angular CLI test builder of its own to double-call it).
import { setupZoneTestEnv } from 'jest-preset-angular/setup-env/zone';

setupZoneTestEnv();

Object.defineProperty(window, 'CSS', {value: null});
Object.defineProperty(document, 'doctype', {
  value: '<!DOCTYPE html>'
});
Object.defineProperty(window, 'getComputedStyle', {
  value: () => {
    return {
      display: 'none',
      appearance: ['-webkit-appearance']
    };
  }
});
