<script lang="ts">
  import eyeHide from '../assets/eye-hide.png'
  import eyeView from '../assets/eye-view.png'

  interface Props {
    on: boolean
    label: string
    onclick: () => void
  }

  let { on, label, onclick }: Props = $props()
</script>

<button
  type="button"
  class="eye"
  class:off={!on}
  aria-pressed={on}
  aria-label={label}
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

  .eye:hover {
    background: rgba(0, 0, 0, 0.06);
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
