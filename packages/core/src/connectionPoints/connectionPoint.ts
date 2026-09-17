declare const connectionPointData: unique symbol;

export interface ConnectionPointType<Payload> {
    readonly id: string;
    readonly [connectionPointData]: Payload;
    is(value: unknown): value is Payload;
}

export type ConnectionPointValue<C extends ConnectionPointType<unknown>> = C extends ConnectionPointType<infer TData> ? TData : never;

export function defineConnectionPointType<P>(id: string, isData: (value: unknown) => value is P): ConnectionPointType<P> {
    return Object.freeze({ id, is: isData }) as ConnectionPointType<P>;
}
