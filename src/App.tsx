/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AppLayout from './components/AppLayout';
import { InstallPrompt } from './components/InstallPrompt';

export default function App() {
  return (
    <>
      <AppLayout />
      <InstallPrompt />
    </>
  );
}
