/**
 * ethers v6 теряет типы методов контракта после `.connect()` — возвращается BaseContract.
 * В тестах методы вызываются динамически (49 сценариев), поэтому возвращаем
 * «динамическую» типизацию, как это было в ethers v5.
 */
import 'ethers';

declare module 'ethers' {
  interface BaseContract {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [method: string]: any;
  }
}
