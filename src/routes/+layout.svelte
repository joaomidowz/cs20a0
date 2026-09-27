<script lang="ts">
  import ToastViewport from '$lib/components/ui/ToastViewport.svelte';
  import RouteLoading from '$lib/components/ui/RouteLoading.svelte';
  import '../app.css';
</script>

<slot />
<RouteLoading />
<ToastViewport />
