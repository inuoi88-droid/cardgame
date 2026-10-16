// エンジンは DOM なしの設定で型チェックする。structuredClone はブラウザ・Node・Deno のどれにもあるので宣言だけ足す
declare function structuredClone<T>(value: T): T;
