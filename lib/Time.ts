export class Time {
    private offset = 0;

    public getMicroSeconds() {
        return Math.floor(process.uptime() * 1000000) + this.offset;
    }

    public setOffset(offset: number) {
        this.offset = offset;
    }
}
