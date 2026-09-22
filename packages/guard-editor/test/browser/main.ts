import { mount } from 'svelte';
import WorkspaceHarness from './WorkspaceHarness.svelte';
import '../../../../../../frontend/src/app.css';
const target = document.getElementById('app');
if (!target) throw new Error('The browser harness mount point is missing');
mount(WorkspaceHarness, { target });
