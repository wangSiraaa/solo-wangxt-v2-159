<script lang="ts">
  import { app } from '../lib/store';

  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if ($app.toast) {
      clearTimeout(timer);
      timer = setTimeout(() => app.dismissToast(), 4200);
    }
    return () => clearTimeout(timer);
  });
</script>

{#if $app.toast}
  <div class="wrap" role="status">
    <button class="toast" onclick={() => app.dismissToast()}>
      {$app.toast}
    </button>
  </div>
{/if}

<style lang="css">
  .wrap {
    position: fixed;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    z-index: 80;
    max-width: 80vw;
  }
  .toast {
    background: #232836;
    border: 1px solid #3d4555;
    color: var(--text);
    padding: 9px 16px;
    border-radius: 8px;
    font-size: 12px;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    cursor: pointer;
  }</style>
