<script lang="ts">
  import eyeHide from '../assets/eye-hide.png'
  import eyeView from '../assets/eye-view.png'

  interface Props {
    on: boolean
    label: string
    onclick: () => void
    disabled?: boolean
  }

  let { on, label, onclick, disabled = false }: Props = $props()
</script>

<button
  type="button"
  class="eye"
  class:off={!on}
  aria-pressed={on}
  aria-label={label}
  {disabled}
  {onclick}
>
  <img src={on ? eyeView : eyeHide} alt="" width="16" height="16" />
</button>

<style>
  .eye {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 1px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
    line-height: 0;
  }

  .eye:hover:not(:disabled) {
    background: var(--shade-wash-soft);
  }

  .eye:disabled {
    cursor: default;
  }

  .eye.off {
    opacity: 0.55;
  }

  img {
    display: block;
    width: 16px;
    height: 16px;
  }
</style>
