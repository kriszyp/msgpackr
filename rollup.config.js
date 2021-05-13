import minify from "rollup-plugin-babel-minify";

export default [
    {
        input: "node.js",
        output: [
            {
                file: "dist/node.cjs",
                format: "cjs"
            }
        ]
    },
    {
        input: "unpack.js",
        plugins: [minify({
            comments: false
        })],
        output: {
            file: "dist/unpack.min.js",
            format: "esm"
        }
    }    
];