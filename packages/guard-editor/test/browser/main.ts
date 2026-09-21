import { mount } from 'svelte';
import Harness from './Harness.svelte';
const target = document.getElementById('app');
if (!target) throw new Error('The browser harness mount point is missing');
mount(Harness, { target });
