<script>
    import '../app.css';
    export let data;

    $: user = data.user;
</script>

<slot />
